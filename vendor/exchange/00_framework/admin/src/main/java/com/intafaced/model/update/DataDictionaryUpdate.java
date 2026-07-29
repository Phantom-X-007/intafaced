package com.intafaced.model.update;

import lombok.Data;
import org.hibernate.validator.constraints.NotBlank;

import com.intafaced.ability.UpdateAbility;
import com.intafaced.entity.DataDictionary;

/**
 * @author Shaoxianjun
 * @Title: ${file_name}
 * @Description:
 * @date 2019/4/1214:46
 */
@Data
public class DataDictionaryUpdate implements UpdateAbility<DataDictionary> {
    @NotBlank
    private String value;
    private String comment;

    @Override
    public DataDictionary transformation(DataDictionary dataDictionary) {
        dataDictionary.setValue(value);
        dataDictionary.setComment(comment);
        return dataDictionary;
    }
}
